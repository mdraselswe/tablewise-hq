import type { Outlet } from "@tablewise/contracts";
import { CreateOutletRequest, UpdateOutletRequest } from "@tablewise/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { keys } from "@/api/keys.ts";
import { outletsApi } from "@/api/resources.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Field, Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/misc.tsx";
import { ApiError } from "@/lib/api.ts";

export type OutletDialogState = { mode: "create" } | { mode: "edit"; outlet: Outlet } | null;

export function OutletDialog({ state, onClose }: { state: OutletDialogState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {state ? (
          <OutletForm key={state.mode === "edit" ? state.outlet.id : "new"} state={state} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OutletForm({ state, onDone }: { state: NonNullable<OutletDialogState>; onDone: () => void }) {
  const editing = state.mode === "edit" ? state.outlet : undefined;
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [timezone, setTimezone] = useState(editing?.timezone ?? "Asia/Dhaka");
  const [active, setActive] = useState(editing?.isActive ?? true);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const save = useMutation({
    meta: { silent: true },
    mutationFn: (body: CreateOutletRequest | UpdateOutletRequest) =>
      editing
        ? outletsApi.update(editing.id, body as UpdateOutletRequest)
        : outletsApi.create(body as CreateOutletRequest),
    onSuccess: (outlet) => {
      void queryClient.invalidateQueries({ queryKey: keys.outlets.all });
      void queryClient.invalidateQueries({ queryKey: keys.reports.all });
      toast.success(editing ? `${outlet.name} updated` : `${outlet.name} is open. Assign menu items next.`);
      onDone();
      if (!editing) void navigate(`/hq/outlets/${outlet.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        setErrors(Object.keys(fields).length ? fields : { form: error.message });
      } else setErrors({ form: "Could not save the outlet." });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const raw = editing
      ? { name, address: address.trim() || null, timezone, isActive: active }
      : { code, name, timezone, ...(address.trim() ? { address } : {}) };
    const parsed = (editing ? UpdateOutletRequest : CreateOutletRequest).safeParse(raw);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : "New outlet"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "The code is permanent: it prefixes every receipt number."
            : "The code prefixes every receipt, for example GUL-000042."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Code" htmlFor="outlet-code" error={errors["code"]}>
          <Input
            id="outlet-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            disabled={Boolean(editing)}
            maxLength={8}
            className="font-mono uppercase"
            autoFocus={!editing}
          />
        </Field>
        <Field label="Name" htmlFor="outlet-name" error={errors["name"]}>
          <Input
            id="outlet-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus={Boolean(editing)}
          />
        </Field>
        <Field label="Address" htmlFor="outlet-address" error={errors["address"]} className="sm:col-span-2">
          <Input id="outlet-address" value={address} onChange={(event) => setAddress(event.target.value)} />
        </Field>
        <Field
          label="Time zone"
          htmlFor="outlet-timezone"
          error={errors["timezone"]}
          hint="Decides which business day a sale belongs to."
          className="sm:col-span-2"
        >
          <Input
            id="outlet-timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="font-mono"
          />
        </Field>
        {editing ? (
          <label className="flex items-center justify-between gap-4 rounded-lg border px-3.5 py-3 sm:col-span-2">
            <span className="grid gap-0.5">
              <span className="text-[0.8125rem] font-medium">Open for sales</span>
              <span className="text-xs text-muted-foreground">
                A closed outlet keeps its history but cannot sell.
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        ) : null}
      </div>
      {errors["form"] ? (
        <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive">
          {errors["form"]}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" pending={save.isPending}>
          {editing ? "Save changes" : "Create outlet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
