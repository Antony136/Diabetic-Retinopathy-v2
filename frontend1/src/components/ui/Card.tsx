import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div className={`bg-surface-container-low rounded-xl ${className}`} {...rest}>
      {children}
    </div>
  );
}
