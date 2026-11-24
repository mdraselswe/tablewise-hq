import type { Sale } from "@tablewise/contracts";
import { cn } from "cn";
import { formatDateTime, formatMoney, PAYMENT_LABELS } from "@/lib/format.ts";

/** A printed-receipt look: the same component in the POS confirmation and the sales drawer. */
export function Receipt({
  sale,
  outletName,
  className,
}: {
  sale: Sale;
  outletName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed bg-background/60 p-4 font-mono text-[0.8125rem]",
        className,
      )}
    >
      <div className="text-center">
        {outletName ? <div className="font-sans text-sm font-semibold">{outletName}</div> : null}
        <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(sale.occurredAt)}</div>
        <div className="mt-2 text-base font-semibold tracking-wide">{sale.receiptNo}</div>
      </div>
      <div className="my-3 border-t border-dashed" />
      <ul className="grid gap-1.5">
        {sale.lines.map((line) => (
          <li key={line.lineNo} className="grid grid-cols-[1fr_auto] gap-x-3">
            <span className="truncate font-sans">{line.itemName}</span>
            <span className="num text-right">{formatMoney(line.lineTotalMinor, { currency: false })}</span>
            <span className="text-xs text-muted-foreground">
              {line.quantity} x {formatMoney(line.unitPriceMinor, { currency: false })}
            </span>
          </li>
        ))}
      </ul>
      <div className="my-3 border-t border-dashed" />
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-sm">Total</span>
        <span className="num text-base font-semibold">{formatMoney(sale.totalMinor)}</span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>
          {PAYMENT_LABELS[sale.paymentMethod]} · {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}
        </span>
        {sale.cashierName ? <span>Served by {sale.cashierName}</span> : null}
      </div>
    </div>
  );
}
