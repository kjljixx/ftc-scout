import { Matrix, SingularValueDecomposition, pseudoInverse } from "ml-matrix";

// Based on this guide for OPR calculation: https://blog.thebluealliance.com/2017/10/05/the-math-behind-opr-an-introduction/

export interface OprData {
    team1: number;
    team2: number;
    result: number;
}

export interface OprResult {
    oprs: Record<number, number>;
    stdErrs: Record<number, number>;
}

export function calculateOpr(scores: OprData[]): OprResult {
    if (scores.length == 0) return { oprs: {}, stdErrs: {} };

    let allTeams = [...new Set(scores.flatMap((s) => [s.team1, s.team2]))];

    let allianceMatrix = new Matrix(
        scores.map((s) => allTeams.map((t) => (t == s.team1 || t == s.team2 ? 1 : 0)))
    );
    let resultsVector = Matrix.columnVector(scores.map((s) => s.result));

    let oprs = new SingularValueDecomposition(allianceMatrix, {
        autoTranspose: true,
    }).solve(resultsVector);

    let ret: OprResult = { oprs: {}, stdErrs: {} };
    for (let i = 0; i < allTeams.length; i++) {
        ret.oprs[allTeams[i]] = oprs.get(i, 0);
    }

    // Standard error of each OPR: sqrt(residual variance * diagonal of pinv(X^T X)), X = alliance matrix.
    let degreesOfFreedom = scores.length - allTeams.length;
    if (degreesOfFreedom <= 0) return ret;

    let residuals = resultsVector.clone().sub(allianceMatrix.mmul(oprs));
    let residualVariance = residuals.norm("frobenius") ** 2 / degreesOfFreedom;
    let covarianceShape = pseudoInverse(allianceMatrix.transpose().mmul(allianceMatrix));
    for (let i = 0; i < allTeams.length; i++) {
        let stdErr = Math.sqrt(residualVariance * covarianceShape.get(i, i));
        if (Number.isFinite(stdErr)) ret.stdErrs[allTeams[i]] = stdErr;
    }
    return ret;
}
