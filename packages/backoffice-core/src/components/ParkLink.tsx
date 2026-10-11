import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./ParkLink.module.css";

/** Navigation to the park detail page (`/parks/:id`). Only a link: the
 * collectivité scope guard lives in `useScopedPark`, so an id outside the
 * organisation simply lands on « Parc introuvable ». */
export function ParkLink({ parkId, children }: { parkId: string; children: ReactNode }) {
  return (
    <Link to={`/parks/${parkId}`} className={styles.link}>
      {children}
    </Link>
  );
}
