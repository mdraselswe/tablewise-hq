import type { SessionUser } from "@tablewise/contracts";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { authApi, sessionQuery } from "@/api/resources.ts";
import { keys } from "@/api/keys.ts";

/** The signed-in user. Only call inside the protected layout, which guarantees one. */
export function useSessionUser(): SessionUser {
  const { data } = useSuspenseQuery(sessionQuery);
  if (!data) throw new Error("useSessionUser() called outside the protected layout");
  return data;
}

export const isHq = (user: SessionUser) => user.role === "HQ_ADMIN";

/** Where a user lands after signing in. */
export const homePath = (user: SessionUser) => (isHq(user) ? "/hq" : "/outlet/pos");

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Drop every cached response: the next user must never see this user's data.
      queryClient.clear();
      queryClient.setQueryData(keys.session, null);
      void navigate("/login", { replace: true });
    },
  });
}
