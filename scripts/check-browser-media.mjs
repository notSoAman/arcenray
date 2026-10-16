// Real browser check, isolated local fixtures only. Requires Chrome and FFmpeg.
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { stripTypeScriptTypes } from "node:module";
const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "arcenray-browser-media-"));
let server;
let browser;
let report;
const reported = new Promise((resolve) => {
  report = resolve;
});
let received = 0;
try {
  for (const name of ["prepare", "validation", "transport"]) {
    const source = await readFile(`apps/web/lib/media/${name}.ts`, "utf8");
    const outputText = stripTypeScriptTypes(source);
    await writeFile(
      join(dir, `${name}.js`),
      outputText.replaceAll('.ts"', '.js"'),
    );
  }
  await exec("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:d=1",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(dir, "film.mp4"),
  ]);
  await writeFile(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><p id="result">RUNNING</p><script type="module">
import {prepareImage,inspectVideo} from '/prepare.js';
import {putBlob} from '/transport.js';
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
try {
 const source=document.createElement('canvas');source.width=1024;source.height=512;
 const ctx=source.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,1024,512);ctx.fillStyle='#00ff00';ctx.fillRect(256,0,512,512);
 const input=await new Promise(r=>source.toBlob(r,'image/png'));
 const profile=await prepareImage(input,'profile_picture');
 assert(profile.width===256&&profile.height===256&&profile.blob.type==='image/webp','profile WebP dimensions');
 const bitmap=await createImageBitmap(profile.blob);const check=document.createElement('canvas');check.width=check.height=256;const pixels=check.getContext('2d');pixels.drawImage(bitmap,0,0);bitmap.close();
 const corner=pixels.getImageData(20,20,1,1).data;assert(corner[1]>220&&corner[0]<30,'center crop retained');
 const poster=await prepareImage(input,'poster');assert(poster.width===800&&poster.height===400,'poster aspect ratio');
 const aborted=new AbortController();aborted.abort();let cancelled=false;try{await prepareImage(input,'poster',aborted.signal)}catch(e){cancelled=e.name==='AbortError'}assert(cancelled,'image cancellation');
 const film=await (await fetch('/film.mp4')).blob();
 const metadata=await inspectVideo(film,'hook');assert(metadata.width===320&&metadata.height===240&&Math.abs(metadata.duration-1)<.1,'real MP4 metadata');
 let progress=0;await putBlob('/upload',{'Content-Type':'video/mp4','Content-Length':'bogus','Authorization':'must-not-send'},film,new AbortController().signal,n=>progress=n);assert(progress===film.size,'upload progress');
 const cancel=new AbortController();const pending=putBlob('/slow',{'Content-Type':'video/mp4'},film,cancel.signal,()=>cancel.abort());let stopped=false;try{await pending}catch(e){stopped=e.name==='AbortError'}assert(stopped,'XHR cancellation');
 document.querySelector('#result').textContent='PASS: WebP encoding, center crop, poster ratio, image cancellation, MP4 metadata, direct PUT progress and cancellation';
} catch(e){document.querySelector('#result').textContent='FAIL: '+e.message;}
await fetch('/result',{method:'POST',body:document.querySelector('#result').textContent});
</script>`,
  );
  server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/result") {
      let text = "";
      for await (const chunk of req) text += chunk;
      report(text);
      res.end();
      return;
    }
    if (req.method === "PUT") {
      if (req.headers.authorization || req.headers.cookie) {
        res.writeHead(403).end();
        return;
      }
      for await (const chunk of req) received += chunk.length;
      if (req.url === "/slow") {
        req.socket.on("close", () => res.destroy());
        return;
      }
      res.writeHead(200).end();
      return;
    }
    const files = {
      "/": ["index.html", "text/html"],
      "/prepare.js": ["prepare.js", "text/javascript"],
      "/validation.js": ["validation.js", "text/javascript"],
      "/transport.js": ["transport.js", "text/javascript"],
      "/film.mp4": ["film.mp4", "video/mp4"],
    };
    const entry = files[req.url];
    if (!entry) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", entry[1]);
    res.end(await readFile(join(dir, entry[0])));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const chrome = process.env.CHROME_BIN || "google-chrome";
  browser = spawn(
    chrome,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      `--user-data-dir=${join(dir, "chrome")}`,
      "--autoplay-policy=no-user-gesture-required",
      `http://127.0.0.1:${port}/`,
    ],
    { stdio: "ignore" },
  );
  browser.on("error", (error) => report("FAIL: " + error.message));
  let timeout;
  const result = await Promise.race([
    reported,
    new Promise((resolve) => {
      timeout = setTimeout(
        () => resolve("FAIL: Browser check timed out"),
        30000,
      );
    }),
  ]);
  clearTimeout(timeout);
  if (!result?.startsWith("PASS:") || !received)
    throw new Error(result || "Browser check did not complete");
  console.log(result);
} finally {
  if (browser && browser.exitCode === null) {
    browser.kill();
    await new Promise((resolve) => browser.once("close", resolve));
  }
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
