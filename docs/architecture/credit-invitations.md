# Credit invitations

Owner: Codex. Feature branch: codex/location-credit-invitations.

Registered collaborators are searched by public name or handle. The film owner sends an in-app invitation for a named role, before or after publication. A recipient alone can accept or decline a pending invitation once; self-credits and unregistered names remain unverified. Multiple different roles are supported. Existing role invitations cannot be sent repeatedly, including after decline. Owners may cancel pending invitations. Accepted credits connect public published films to a creative profile and the existing collaboration graph/indexing pipeline.

New RPC contracts: search_credit_collaborators(p_query, p_limit=8) returns up to ten public identities; invite_film_credit(p_film_id,p_profile_id,p_role) returns the credit UUID; get_my_credit_invitations() returns pending credit_id, film_id, film_title, film_status, role, owner_handle, owner_name and invited_at for the current recipient only. Existing respond_to_credit signature is unchanged, with one-time response and availability/block checks. No client-controlled actor parameter.

Draft invitations disclose only the film title, role and inviting owner to the intended recipient. They do not grant draft film/media access; publication remains required for public portfolio visibility. No email, SMS, project editing privileges or ownership transfer is introduced.

The migration is prepared for rollback-only testing and founder review before applying to the shared pilot. Public wrappers use invoker execution; privileged bodies stay private with explicit grants and fixed search paths. Existing write limits and indexing triggers are retained.
