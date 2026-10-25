import { useCallback } from "react";
import { Gate, useSession } from "../src/session";
import {
  Screen,
  Title,
  Muted,
  Copy,
  Panel,
  Nav,
  Button,
  Notice,
  Busy,
  useResource,
  useAction,
} from "../src/ui";
function Invitations() {
  const { api } = useSession();
  const a = useAction();
  const load = useCallback(async () => {
    const r = await api!.credits.invitations();
    if (r.error) throw r.error;
    return r.data ?? [];
  }, [api]);
  const r = useResource(load);
  return (
    <Screen>
      <Title>Your film credits</Title>
      <Muted>Confirm only work you contributed to.</Muted>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {r.data?.length === 0 ? <Muted>No pending invitations.</Muted> : null}
      {r.data?.map((c) => (
        <Panel key={c.credit_id}>
          <Copy>{c.film_title}</Copy>
          <Muted>
            {c.role} · invited by {c.owner_name}
          </Muted>
          {c.film_status === "published" ? (
            <Nav
              title="View film"
              href={{ pathname: "/film/[id]", params: { id: c.film_id } }}
            />
          ) : (
            <Muted>Draft film</Muted>
          )}
          {[true, false].map((accept) => (
            <Button
              key={String(accept)}
              title={accept ? "Accept credit" : "Decline"}
              secondary={!accept}
              disabled={a.busy}
              onPress={() =>
                a.run(async () => {
                  const x = await api!.credits.respond(c.credit_id, accept);
                  if (x.error) throw x.error;
                  r.reload();
                })
              }
            />
          ))}
        </Panel>
      ))}
      <Notice message={a.error} />
    </Screen>
  );
}
export default function Route() {
  return (
    <Gate>
      <Invitations />
    </Gate>
  );
}
