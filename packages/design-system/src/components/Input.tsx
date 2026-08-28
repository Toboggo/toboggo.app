import { useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./Input.module.css";

interface FieldWrapProps {
  label?: string;
  help?: string;
  error?: string;
  children: ReactNode;
}

function FieldWrap({ label, help, error, children }: FieldWrapProps) {
  return (
    <label className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}
      {children}
      {error ? <span className={styles.helpError}>{error}</span> : help ? <span className={styles.help}>{help}</span> : null}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  help?: string;
  error?: string;
}

export function Input({ label, help, error, className, ...rest }: InputProps) {
  return (
    <FieldWrap label={label} help={help} error={error}>
      <input className={clsx(styles.input, error && styles.error, className)} {...rest} />
    </FieldWrap>
  );
}

export function Textarea({
  label,
  help,
  error,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; help?: string; error?: string }) {
  return (
    <FieldWrap label={label} help={help} error={error}>
      <textarea className={clsx(styles.textarea, error && styles.error, className)} {...rest} />
    </FieldWrap>
  );
}

export function Select({
  label,
  help,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; help?: string }) {
  return (
    <FieldWrap label={label} help={help}>
      <select className={clsx(styles.select, className)} {...rest}>
        {children}
      </select>
    </FieldWrap>
  );
}

export function PasswordInput({ label, help, error, className, ...rest }: InputProps) {
  return (
    <FieldWrap label={label} help={help} error={error}>
      <PasswordInputInner className={className} {...rest} />
    </FieldWrap>
  );
}

function PasswordInputInner({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.suffixWrap}>
      <input type={visible ? "text" : "password"} className={clsx(styles.input, className)} {...rest} />
      <button type="button" className={styles.suffixBtn} onClick={() => setVisible((v) => !v)}>
        {visible ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}
