import { useId, useState, type ReactNode } from "react";
import styles from "./MercadoPagoTestPage.module.css";

// Desktop keeps the existing content visible; mobile can disclose secondary text.
export function MobileExplanation({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={styles.mobileExplanation}>
    <button type="button" className={styles.mobileDisclosure} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "−" : "+"} {label}</button>
    <div id={id} className={open ? styles.explanationOpen : styles.explanationClosed}>{children}</div>
  </div>;
}
