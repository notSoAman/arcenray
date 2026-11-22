// eslint-disable-next-line no-undef -- Expo loads fingerprint configs as CommonJS.
module.exports = {
  // EAS mounts file-based secrets outside the uploaded project. The secret file
  // changes native notification configuration but must not make runtime
  // compatibility depend on a path that is unavailable before the build starts.
  ignorePaths: ["**/eas-environment-secrets/**/*"],
};
