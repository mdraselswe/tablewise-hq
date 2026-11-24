import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Store } from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authApi } from "@/api/resources.ts";
import { keys } from "@/api/keys.ts";
import { Wordmark } from "@/components/layout/brand.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/input.tsx";
import { ApiError } from "@/lib/api.ts";
import { homePath } from "./session.ts";

/** Seeded demo accounts (apps/api/src/seed/demo-data.ts). Shown so reviewers can try every role. */
const DEMO_PASSWORD = "Tablewise#2026";
const DEMO_ACCOUNTS = [
  { email: "hq@tablewise.app", name: "Nadia Rahman", role: "HQ administrator", icon: Building2 },
  { email: "gulshan@tablewise.app", name: "Arif Hossain", role: "Gulshan outlet", icon: Store },
  { email: "dhanmondi@tablewise.app", name: "Sumaiya Akter", role: "Dhanmondi outlet", icon: Store },
  { email: "uttara@tablewise.app", name: "Tanvir Ahmed", role: "Uttara outlet", icon: Store },
] as const;

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      authApi.login(credentials.email, credentials.password),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(keys.session, user);
      const next = params.get("next");
      void navigate(next?.startsWith("/") && !next.startsWith("//") ? next : homePath(user), {
        replace: true,
      });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  const error = login.error instanceof ApiError ? login.error : undefined;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Wordmark className="[&_rect]:fill-primary-foreground/12" />
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            One menu. Every outlet. Stock you can trust.
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-primary-foreground/75">
            Set prices once at HQ, sell at the counter, cook from the kitchen display and watch revenue arrive
            as it happens.
          </p>
        </div>
        <dl className="relative z-10 grid grid-cols-3 gap-6 border-t border-primary-foreground/15 pt-6 text-sm">
          {[
            ["Gap-free", "receipt numbers per outlet"],
            ["Zero", "oversold items, by constraint"],
            ["Live", "sales and kitchen updates"],
          ].map(([value, label]) => (
            <div key={value}>
              <dt className="text-lg font-semibold">{value}</dt>
              <dd className="mt-0.5 text-primary-foreground/65">{label}</dd>
            </div>
          ))}
        </dl>
        {/* Quiet texture: concentric "plates". */}
        <svg
          aria-hidden="true"
          className="absolute -right-40 -bottom-40 size-[640px] opacity-[0.08]"
          viewBox="0 0 100 100"
        >
          {[48, 38, 28, 18].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="0.4" />
          ))}
        </svg>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <Wordmark className="mb-10 lg:hidden" />
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your Tablewise account.</p>

          <form onSubmit={submit} className="mt-8 grid gap-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                aria-invalid={error ? true : undefined}
              />
            </Field>
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive"
              >
                {error.code === "VALIDATION_FAILED"
                  ? "Enter a valid email and a password of 8+ characters."
                  : error.message}
              </p>
            ) : null}
            <Button type="submit" size="lg" pending={login.isPending} className="mt-1 w-full">
              Sign in
              <ArrowRight />
            </Button>
          </form>

          <section className="mt-10" aria-labelledby="demo-heading">
            <div className="flex items-center gap-3">
              <h3
                id="demo-heading"
                className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                Demo accounts
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Password for all:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">{DEMO_PASSWORD}</code>
            </p>
            <ul className="mt-3 grid gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    disabled={login.isPending}
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                      login.mutate({ email: account.email, password: DEMO_PASSWORD });
                    }}
                    className="group flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-(--shadow-sm) transition-[border-color,translate] duration-(--motion-fast) hover:border-ring/60 active:translate-y-px disabled:opacity-60"
                  >
                    <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground">
                      <account.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="grid flex-1 leading-tight">
                      <span className="text-[0.8125rem] font-medium">{account.role}</span>
                      <span className="text-xs text-muted-foreground">{account.email}</span>
                    </span>
                    <ArrowRight
                      className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-[opacity,translate] duration-(--motion-fast) group-hover:translate-x-0 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </motion.div>
      </main>
    </div>
  );
}
