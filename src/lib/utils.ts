import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-6 py-5 sm:py-7";
