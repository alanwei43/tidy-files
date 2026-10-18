

export function parseKeepRepeatSelection(answer: string, candidateCount: number): Set<number> | undefined {
    if (!/^[1-9]\d*(?:(?:\s*,\s*|\s+)[1-9]\d*)*$/.test(answer))
        return undefined;
    const indexes = new Set<number>();
    for (const value of answer.split(/[,\s]+/)) {
        const index = Number(value) - 1;
        if (!Number.isSafeInteger(index) || index >= candidateCount)
            return undefined;
        indexes.add(index);
    }
    return indexes;
}
