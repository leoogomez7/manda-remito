import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PAGE_CONTAINER_CLASS = "mx-auto w-full min-w-0 max-w-7xl px-4 py-5 sm:px-6 sm:py-7";
