import { useInsight } from "@semoss/sdk/react";
import { type ChangeEvent, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/contexts";
import { useLoadingState } from "@/hooks";

/**
 * Renders a the login page if the user is not already logged in, otherwise sends them to the home page.
 *
 * @component
 */
export const LoginPage = () => {
	const { isAuthorized } = useInsight();
	const { login } = useAppContext();
	const { state } = useLocation(); // If the user was routed here, then there may be information about where they were trying to go

	/**
	 * State / Refs
	 */
	const [username, setUsername] = useState<string>("");
	const [password, setPassword] = useState<string>("");
	const [isLoginLoading, setIsLoginLoading] = useLoadingState(false);
	const [showError, setShowError] = useState<boolean>(false); // State to show the user that there was an error with their login
	const passwordInputRef = useRef<HTMLInputElement>(null); // A ref to store the password input, so that pressing Enter in the username box will focus it

	/**
	 * Functions
	 */
	const passwordLogin = async () => {
		const loadingKey = setIsLoginLoading(true);

		// Attempt to log in
		const success = await login(username, password);
		if (!success) {
			setShowError(true);
			passwordInputRef.current?.focus();
		}
		setIsLoginLoading(false, loadingKey);
	};

	// When the user begins typing, clear out the errors
	const updateState = (
		state: "username" | "password",
		event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => {
		setShowError(false);
		(state === "username" ? setUsername : setPassword)(event.target.value);
	};

	/**
	 * Constants
	 */
	const isLoginReady = username && password && !showError;

	// If the user is already authorized, we can route them off of this page. If the user was routed here, attempt to send them back to their target
	if (isAuthorized) return <Navigate to={state?.target ?? "/"} />;

	return (
		<div className="flex min-h-full items-center justify-center px-4">
			{/* Decorative ambient orbs */}
			<div className="pointer-events-none fixed inset-0 overflow-hidden">
				<div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-gradient-to-br from-slate-300/35 to-sky-200/25 dark:from-slate-500/15 blur-3xl animate-pulse-soft" />
				<div
					className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-gradient-to-tr from-sky-200/30 to-slate-300/20 dark:from-sky-500/10 blur-3xl animate-pulse-soft"
					style={{ animationDelay: "1.25s" }}
				/>
				<div
					className="absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-gradient-to-r from-slate-200/25 to-sky-200/20 dark:from-slate-500/10 blur-3xl animate-pulse-soft"
					style={{ animationDelay: "2.5s" }}
				/>
			</div>

			{/* Glass login card */}
			<div className="relative w-full max-w-sm rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-8 shadow-xl shadow-slate-400/10 dark:shadow-black/20 backdrop-blur-xl">
				<div className="mb-8 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Welcome back
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Sign in to your account
					</p>
				</div>

				<div className="flex flex-col space-y-4">
					<div className="space-y-2">
						<Label htmlFor="username">Username</Label>
						<Input
							id="username"
							value={username}
							onChange={(event) => updateState("username", event)}
							required
							disabled={isLoginLoading}
							className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur"
							onKeyDown={(event) => {
								if (event.key === "Enter" && username) {
									// If the user hits enter, take them to the password box
									passwordInputRef.current?.focus();
								}
							}}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							value={password}
							onChange={(event) => updateState("password", event)}
							required
							disabled={isLoginLoading}
							type="password"
							className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur"
							onKeyDown={(event) => {
								if (event.key === "Enter" && isLoginReady) {
									// If the user hits Enter, have them attempt to log in
									passwordLogin();
								}
							}}
							ref={passwordInputRef}
						/>
						{showError && (
							<p className="text-sm text-destructive">
								Username or password is incorrect.
							</p>
						)}
					</div>
					<Button
						onClick={passwordLogin}
						disabled={!isLoginReady || isLoginLoading}
						className="w-full bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white transition-all duration-200 shadow-lg shadow-slate-500/20 hover:shadow-xl hover:shadow-slate-500/25"
					>
						{isLoginLoading ? "Logging in..." : "Log in"}
					</Button>
				</div>
			</div>
		</div>
	);
};
