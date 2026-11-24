import type { StockLevel } from "@tablewise/contracts";
import { AdjustStockRequest } from "@tablewise/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { keys } from "@/api/keys.ts";
import { inventoryApi } from "@/api/resources.ts";
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
import { Segmented } from "@/components/ui/segmented.tsx";
import { ApiError } from "@/lib/api.ts";

export type AdjustMode = "RESTOCK" | "ADJUSTMENT" | "WASTE";

const MODES = [
  { value: "RESTOCK", label: "Restock" },
  { value: "ADJUSTMENT", label: "Count" },
  { value: "WASTE", label: "Waste" },
] as const;

const COPY: Record<AdjustMode, { field: string; hint: string; submit: string }> = {
  RESTOCK: { field: "Units received", hint: "Adds to what is on hand.", submit: "Add stock" },
  ADJUSTMENT: {
    field: "Counted on hand",
    hint: "Sets stock to what you counted; the difference is recorded.",
    submit: "Save count",
  },
  WASTE: {
    field: "Units wasted",
    hint: "Spoiled, dropped or expired. Removes from stock.",
    submit: "Write off",
  },
};

export interface AdjustTarget {
  level: StockLevel;
  itemName: string;
  mode: AdjustMode;
}

/** Restock, stock count or waste for one item. Every change lands in the audit trail. */
export function AdjustStockDialog({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target ? <AdjustForm key={target.level.menuItemId} target={target} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ target, onDone }: { target: AdjustTarget; onDone: () => void }) {
  const { level } = target;
  const [mode, setMode] = useState<AdjustMode>(target.mode);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();

  const value = Number.parseInt(amount, 10);
  const delta = Number.isNaN(value)
    ? 0
    : mode === "RESTOCK"
      ? value
      : mode === "WASTE"
        ? -value
        : value - level.onHand;
  const after = level.onHand + delta;

  const adjust = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const body = AdjustStockRequest.parse({
        delta,
        reason: mode,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      return inventoryApi.adjust(level.outletId, level.menuItemId, body);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<StockLevel[]>(keys.inventory.levels(level.outletId), (levels) =>
        levels?.map((candidate) => (candidate.menuItemId === updated.menuItemId ? updated : candidate)),
      );
      void queryClient.invalidateQueries({
        queryKey: [...keys.inventory.outlet(level.outletId), "movements"],
      });
      toast.success(`${target.itemName}: ${updated.onHand} on hand`);
      onDone();
    },
    onError: (failure) =>
      setError(failure instanceof ApiError ? failure.message : "Could not save the change."),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (Number.isNaN(value) || value < 0) return setError("Enter a whole number.");
    if (delta === 0)
      return setError(mode === "ADJUSTMENT" ? "The count matches what is on hand." : "Enter at least 1.");
    if (after < 0) return setError(`Only ${level.onHand} on hand. Stock cannot go below zero.`);
    adjust.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{target.itemName}</DialogTitle>
        <DialogDescription>
          <span className="num">{level.onHand}</span> on hand now. Alerts below {level.lowStockThreshold}.
        </DialogDescription>
      </DialogHeader>
      <Segmented
        aria-label="Kind of change"
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError(undefined);
        }}
        options={MODES}
        className="flex w-full"
      />
      <Field label={COPY[mode].field} htmlFor="adjust-amount" hint={COPY[mode].hint} error={error}>
        <Input
          id="adjust-amount"
          type="number"
          inputMode="numeric"
          min={0}
          autoFocus
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <Field label="Note" htmlFor="adjust-note" hint="Optional. Shown in the audit trail.">
        <Input
          id="adjust-note"
          value={note}
          maxLength={280}
          onChange={(event) => setNote(event.target.value)}
          placeholder={mode === "RESTOCK" ? "Supplier delivery #" : "Reason"}
        />
      </Field>
      <div className="flex items-center justify-between rounded-lg bg-muted px-3.5 py-2.5 text-[0.8125rem]">
        <span className="text-muted-foreground">After this change</span>
        <span className="num font-semibold">
          {level.onHand} {delta >= 0 ? "+" : "−"} {Math.abs(delta)} ={" "}
          <span className={after < 0 ? "text-destructive" : ""}>{after}</span>
        </span>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          pending={adjust.isPending}
          variant={mode === "WASTE" ? "destructive" : "default"}
        >
          {COPY[mode].submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
