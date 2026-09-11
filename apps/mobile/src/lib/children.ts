/**
 * Single shared source for a parent's children + their derived ages — every
 * screen that needs either (Profile hub, the "Mes enfants" screens, the
 * ParkList age filter) goes through this, so age is never recomputed
 * differently in two places.
 */
import { useQuery } from "@tanstack/react-query";
import { computeChildAge, listChildren, type Child } from "@toboggo/shared";
import { useSession } from "./session";

export function useChildren() {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: ["children", userId],
    queryFn: () => listChildren(userId!),
    enabled: !!userId,
  });
}

/** Current ages for children whose birth data is known — unknown/invalid entries are dropped. */
export function useChildAges(): number[] {
  const { data: children = [] } = useChildren();
  return children.map((c: Child) => computeChildAge(c)).filter((a: number | null): a is number => a != null);
}
