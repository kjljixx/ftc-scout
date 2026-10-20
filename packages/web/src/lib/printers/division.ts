import { longestCommonPrefix } from "@ftc-scout/common";

export function divisionShortName(name: string, allEventNames: string[]): string {
    return name
        .slice(longestCommonPrefix(allEventNames).length)
        .trim()
        .replace(/\-\s*/, "")
        .replace(/\s*division$/i, "");
}

export function divisionAbbreviation(shortName: string): string {
    return shortName.slice(0, 4).replace(/^./, (c) => c.toUpperCase());
}
