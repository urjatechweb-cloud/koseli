const npr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Paisa -> "Rs. 1,740". Display only. */
export function rs(minor: number): string {
  return `Rs. ${npr.format(minor / 100)}`;
}

export function deliveryLabel(minutes: number): string {
  if (minutes <= 180) return "Delivered today, within 3 hours";
  if (minutes <= 360) return "Delivered today";
  if (minutes <= 1440) return "Delivered tomorrow";
  return `Delivered in ${Math.ceil(minutes / 1440)} days`;
}
