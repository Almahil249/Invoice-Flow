import { useState, useEffect } from "react";
import { getTeams, type TeamsMap } from "@/lib/api";

export function useTeams() {
    const [teams, setTeams] = useState<TeamsMap>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let mounted = true;

        const fetchTeams = async () => {
            try {
                setIsLoading(true);
                const data = await getTeams();
                if (mounted) {
                    setTeams(data);
                    setError(null);
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error("Failed to fetch teams"));
                    // Fallback to empty map on error, similar to original behavior
                    setTeams({});
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchTeams();

        return () => {
            mounted = false;
        };
    }, []);

    return { teams, isLoading, error };
}
