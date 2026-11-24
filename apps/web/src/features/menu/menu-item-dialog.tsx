import type { MenuItem } from "@tablewise/contracts";
import { CreateMenuItemRequest, UpdateMenuItemRequest } from "@tablewise/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { keys } from "@/api/keys.ts";
import { catalogApi, categoriesQuery, itemAssignmentsQuery, outletsQuery } from "@/api/resources.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Field, Input, Textarea } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/misc.tsx";
import { MoneyInput } from "@/components/ui/money-input.tsx";
import { ApiError } from "@/lib/api.ts";
import { formatMoney, minorToInput, parseMoney } from "@/lib/format.ts";

export type MenuItemDialogState = { mode: "create" } | { mode: "edit"; item: MenuItem } | null;

export function MenuItemDialog({ state, onClose }: { state: MenuItemDialogState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {state ? (
          <MenuItemForm key={state.mode === "edit" ? state.item.id : "new"} state={state} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Validation issues from zod (client) or the API (server), keyed by field. */
type Errors = Partial<Record<string, string>>;

function MenuItemForm({ state, onDone }: { state: NonNullable<MenuItemDialogState>; onDone: () => void }) {
  const editing = state.mode === "edit" ? state.item : undefined;
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [price, setPrice] = useState(editing ? minorToInput(editing.basePriceMinor) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [active, setActive] = useState(editing?.isActive ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const categories = useQuery(categoriesQuery);
  const queryClient = useQueryClient();
  const listId = useId();

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (body: CreateMenuItemRequest | UpdateMenuItemRequest) =>
      editing
        ? catalogApi.updateItem(editing.id, body as UpdateMenuItemRequest)
        : catalogApi.createItem(body as CreateMenuItemRequest),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: keys.catalog.all });
      toast.success(editing ? `${item.name} updated` : `${item.name} added to the master menu`);
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        setErrors(Object.keys(fields).length ? fields : { form: error.message });
      } else setErrors({ form: "Could not save the item." });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const basePriceMinor = parseMoney(price);
    if (basePriceMinor === undefined)
      return setErrors({ basePriceMinor: "Enter a price like 250 or 250.50." });
    const raw = editing
      ? { name, category, basePriceMinor, description: description.trim() || null, isActive: active }
      : { sku, name, category, basePriceMinor, ...(description.trim() ? { description } : {}) };
    // The same zod schema the API uses, so most mistakes are caught before the request.
    const parsed = (editing ? UpdateMenuItemRequest : CreateMenuItemRequest).safeParse(raw);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : "New menu item"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Changes apply to every outlet. Outlet price overrides stay as they are."
            : "Add it to the master menu, then assign it to outlets."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="item-name" error={errors["name"]} className="sm:col-span-2">
          <Input
            id="item-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            aria-invalid={errors["name"] ? true : undefined}
          />
        </Field>
        <Field
          label="SKU"
          htmlFor="item-sku"
          error={errors["sku"]}
          hint={editing ? "SKUs never change." : "Letters, digits and dashes."}
        >
          <Input
            id="item-sku"
            value={sku}
            onChange={(event) => setSku(event.target.value.toUpperCase())}
            disabled={Boolean(editing)}
            className="font-mono uppercase"
            aria-invalid={errors["sku"] ? true : undefined}
          />
        </Field>
        <Field
          label="Base price"
          htmlFor="item-price"
          error={errors["basePriceMinor"]}
          hint="Outlets may override it."
        >
          <MoneyInput
            id="item-price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0.00"
            aria-invalid={errors["basePriceMinor"] ? true : undefined}
          />
        </Field>
        <Field label="Category" htmlFor="item-category" error={errors["category"]} className="sm:col-span-2">
          <Input
            id="item-category"
            list={listId}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-invalid={errors["category"] ? true : undefined}
          />
          <datalist id={listId}>
            {(categories.data ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Description"
          htmlFor="item-description"
          error={errors["description"]}
          className="sm:col-span-2"
        >
          <Textarea
            id="item-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            maxLength={500}
          />
        </Field>
        {editing ? (
          <label className="flex items-center justify-between gap-4 rounded-lg border px-3.5 py-3 sm:col-span-2">
            <span className="grid gap-0.5">
              <span className="text-[0.8125rem] font-medium">Active</span>
              <span className="text-xs text-muted-foreground">
                Inactive items disappear from every outlet's menu at once.
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        ) : null}
      </div>
      {editing ? <SoldAt menuItemId={editing.id} /> : null}
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
          {editing ? "Save changes" : "Create item"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SoldAt({ menuItemId }: { menuItemId: string }) {
  const assignments = useQuery(itemAssignmentsQuery(menuItemId));
  const outlets = useQuery(outletsQuery);
  const names = new Map((outlets.data ?? []).map((outlet) => [outlet.id, outlet.name]));
  if (!assignments.data) return null;
  return (
    <div className="grid gap-2">
      <div className="text-[0.8125rem] font-medium">
        Sold at {assignments.data.length} {assignments.data.length === 1 ? "outlet" : "outlets"}
      </div>
      {assignments.data.length ? (
        <ul className="divide-y rounded-lg border text-[0.8125rem]">
          {assignments.data.map((assignment) => (
            <li key={assignment.outletId} className="flex items-center justify-between px-3 py-2">
              <Link to={`/hq/outlets/${assignment.outletId}`} className="hover:underline">
                {names.get(assignment.outletId) ?? "Outlet"}
              </Link>
              <span className="num">
                {formatMoney(assignment.effectivePriceMinor)}
                {assignment.priceOverrideMinor !== null ? (
                  <span className="ml-1.5 text-xs text-primary">override</span>
                ) : null}
                {!assignment.isAvailable ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">paused</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Assign it from an outlet's Menu and pricing tab.</p>
      )}
    </div>
  );
}
