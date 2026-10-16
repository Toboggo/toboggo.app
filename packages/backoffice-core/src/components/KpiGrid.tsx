import type { ReactNode } from "react";
import styles from "./KpiGrid.module.css";

/**
 * Grille des KPI de premier niveau (`StatCard`) : 4 colonnes en largeur
 * bureau, 2 puis 1 en largeur réduite. Remplace les grilles recopiées dans
 * chaque écran (Dashboard Admin, Dashboard Collectivité, Mes parcs).
 */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
