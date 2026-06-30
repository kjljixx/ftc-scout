import { HOME_TEAM_COOKIE_NAME } from "$lib/constants";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
    let homeTeamStr = cookies.get(HOME_TEAM_COOKIE_NAME);
    let homeTeam = homeTeamStr ? +homeTeamStr : null;
    if (homeTeam !== null && isNaN(homeTeam)) homeTeam = null;
    return { homeTeam };
};
