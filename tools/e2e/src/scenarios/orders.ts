export interface Order {
  id: string;
  product: string;
  qty: number;
  price: number;
}

export interface OrderSummary {
  totalItems: number;
  totalValue: number;
  orders: Order[];
}

export function processOrders(orders: Order[]): OrderSummary {
  let totalItems = 0;
  let totalValue = 0;

  for (const order of orders) {
    // line 28 — good loop breakpoint
    const lineTotal = order.qty * order.price;
    totalItems += order.qty;
    totalValue += lineTotal;
    console.log(
      `[orders] ${order.id}: ${order.product} x${order.qty} = $${lineTotal.toFixed(2)}`,
    );
  }

  const summary: OrderSummary = {
    totalItems,
    totalValue,
    orders,
  };

  console.log(
    `[orders] summary: ${totalItems} items, $${totalValue.toFixed(2)} total`,
  );

  return summary;
}

export function findExpensiveOrders(
  orders: Order[],
  threshold: number,
): Order[] {
  return orders.filter((o) => o.price > threshold); // line 50 — conditional bp test
}
