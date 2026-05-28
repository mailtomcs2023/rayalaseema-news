"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Constituency {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
}

export function ConstituencyFilter({ constituencies }: { constituencies: Constituency[] }) {
  const router = useRouter();

  return (
    // Radix-backed Select via shadcn. value="" is intentionally NOT set —
    // we want the trigger to show only the placeholder until a real
    // constituency is picked, and Radix doesn't allow "" as a SelectItem
    // value (it's reserved for "clear"). We just navigate on selection.
    <Select
      onValueChange={(slug) => {
        if (slug) router.push(`/constituency/${slug}`);
      }}
    >
      <SelectTrigger
        className="h-11 min-w-55 border-2 bg-white text-sm font-bold text-foreground"
        style={{ borderColor: "var(--color-brand)" }}
      >
        <SelectValue placeholder="ఏ నియోజకవర్గం" />
      </SelectTrigger>
      <SelectContent>
        {constituencies.map((c) => (
          <SelectItem key={c.id} value={c.slug}>
            {c.name} <span className="text-muted-foreground">({c.nameEn})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
