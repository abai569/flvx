import { loadStoredOrder } from "@/utils/order-storage";

export interface ForwardOrderItem {
  id: number;
  userId?: number;
  inx?: number;
}

export const FORWARD_ORDER_KEY = "forward-order";

// 构建用户独立的存储 key
export const buildForwardOrderKey = (userId: number | null): string => {
  if (userId === null) {
    return FORWARD_ORDER_KEY;
  }
  return `${FORWARD_ORDER_KEY}:u:${userId}`;
};

export const getUserScopedForwards = <T extends ForwardOrderItem>(
  forwards: T[],
  currentUserId: number | null,
): T[] => {
  if (currentUserId === null) {
    return forwards;
  }

  return forwards.filter((item) => item.userId === currentUserId);
};

export const buildForwardOrder = <T extends ForwardOrderItem>(
  forwards: T[],
  currentUserId: number | null,
): { order: number[]; fromDatabase: boolean } => {
  const userForwards = getUserScopedForwards(forwards, currentUserId);

  const hasDbOrdering = userForwards.some(
    (item) => item.inx !== undefined && item.inx !== 0,
  );

  if (hasDbOrdering) {
    const dbOrder = [...userForwards]
      .sort((a, b) => (a.inx ?? 0) - (b.inx ?? 0))
      .map((item) => item.id);

    return { order: dbOrder, fromDatabase: true };
  }

  // 使用用户独立的存储 key
  const orderKey = buildForwardOrderKey(currentUserId);
  return {
    order: loadStoredOrder(
      orderKey,
      userForwards.map((item) => item.id),
    ),
    fromDatabase: false,
  };
};
