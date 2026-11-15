import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router";
import { getAccount, logout } from "../api/client";
import { ApiError, isAbortError } from "../api/errors";
import type { Account, Me, Member } from "../api/types";
import { Aurora } from "../shared/Aurora";
import { Appointments } from "./appointments/Appointments";
import { CircleScreen } from "./circle/CircleScreen";
import { Insights } from "./insights/Insights";
import { Medicines } from "./medicines/Medicines";
import { SessionContext, type SessionValue } from "./session";
import { Shell } from "./shell/Shell";
import { Today } from "./today/Today";
import { ErrorState, Skeleton, ToastProvider } from "./ui";
import { AuthScreen } from "./welcome/Auth";
import { CircleHub } from "./welcome/Welcome";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/screens.css";

type State =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "hub"; account: Account }
  | { status: "ready"; account: Account; me: Me }
  | { status: "error"; error: unknown };

const fromAccount = (account: Account): State =>
  account.active ? { status: "ready", account, me: account.active } : { status: "hub", account };

/**
 * Gate for the app: authentication first (sign in or create an account), then a circle
 * the person is a member of, then the app itself.
 */
export default function AppRoot() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [params] = useSearchParams();

  useEffect(() => {
    const controller = new AbortController();
    getAccount(controller.signal)
      .then((account) => setState(fromAccount(account)))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setState(error instanceof ApiError && error.status === 401 ? { status: "signedOut" } : { status: "error", error });
      });
    return () => controller.abort();
  }, [attempt]);

  const reloadAccount = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const setMember = useCallback((member: Member) => {
    setState((s) => (s.status === "ready" ? { ...s, me: { ...s.me, member } } : s));
  }, []);

  /** Back to the list of circles, without signing out. */
  const switchCircle = useCallback(() => {
    setState((s) => (s.status === "ready" ? { status: "hub", account: s.account } : s));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setState({ status: "signedOut" });
    }
  }, []);

  const session = useMemo<SessionValue | null>(
    () =>
      state.status === "ready"
        ? { user: state.account.user, me: state.me, setMember, switchCircle, signOut }
        : null,
    [state, setMember, switchCircle, signOut],
  );

  return (
    <ToastProvider>
      <Aurora intensity="calm" />
      {state.status === "loading" && (
        <main className="hx-boot" id="main">
          <h1 className="visually-hidden">Hearth</h1>
          <Skeleton lines={3} label="Opening Hearth" />
        </main>
      )}
      {state.status === "error" && (
        <main className="hx-boot" id="main">
          <h1 className="visually-hidden">Hearth</h1>
          <ErrorState title="We couldn't open Hearth" error={state.error} onRetry={reloadAccount} />
        </main>
      )}
      {state.status === "signedOut" && (
        <AuthScreen
          initialMode={params.get("join") === "1" || params.get("start") === "1" ? "signup" : "signin"}
          onSignedIn={(account) => setState(fromAccount(account))}
        />
      )}
      {state.status === "hub" && (
        <CircleHub
          account={state.account}
          onOpen={reloadAccount}
          onSignOut={() => void signOut()}
        />
      )}
      {session && (
        <SessionContext.Provider value={session}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<Today />} />
              <Route path="medicines" element={<Medicines />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="circle" element={<CircleScreen />} />
              <Route path="insights" element={<Insights />} />
              <Route path="*" element={<Navigate to="today" replace />} />
            </Route>
          </Routes>
        </SessionContext.Provider>
      )}
    </ToastProvider>
  );
}

