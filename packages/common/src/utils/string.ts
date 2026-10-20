export function titleCase(s: string): string {
    return (s[0]?.toUpperCase() ?? "") + s.substring(1);
}

export function longestCommonPrefix(words: string[]): string {
    // check border cases size 1 array and empty first word)
    if (!words[0] || words.length == 1) return words[0] || "";

    let i = 0;
    while (words[0][i] && words.every((w) => w[i] === words[0][i])) i++;

    return words[0].slice(0, i);
}

export function isFinalsDivision(eventName: string, relatedEventNames: string[]): boolean {
    if (relatedEventNames.length === 0) return false;

    let prefix = longestCommonPrefix([eventName, ...relatedEventNames]);
    let remainder = eventName.slice(prefix.length).trim().replace(/\-\s*/, "");
    return remainder.length === 0 || remainder === "Finals Division";
}
