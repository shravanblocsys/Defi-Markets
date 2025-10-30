import { useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/store";
import { getProfile } from "@/store/slices/authSlice";

export const useAuthInitialization = () => {
  const dispatch = useAppDispatch();
  const { token, isAuthenticated, user, isLoading } = useAppSelector(
    (state) => state.auth
  );

  useEffect(() => {
    // Only fetch profile if we have a token but no user data
    if (token && isAuthenticated && !user && !isLoading) {
      console.log("Fetching user profile on app initialization...");
      dispatch(getProfile());
    }
  }, [dispatch, token, isAuthenticated, user, isLoading]);

  return { isLoading };
};
