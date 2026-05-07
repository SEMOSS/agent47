import { useInsight } from "@semoss/sdk/react";
import { type ChangeEvent, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/contexts";
import { useLoadingState } from "@/hooks";
import { SemossAsciiHero } from "@/components/SemossAsciiHero";
import logoSvg from "@/assets/img/logo.svg";

/**
 * Renders a the login page if the user is not already logged in, otherwise sends them to the home page.
 *
 * @component
 */
export const LoginPage = () => {
	const { isAuthorized } = useInsight();
	const { login } = useAppContext();
	const { state } = useLocation();

	const [username, setUsername] = useState<string>("");
	const [password, setPassword] = useState<string>("");
	const [isLoginLoading, setIsLoginLoading] = useLoadingState(false);
	const [showError, setShowError] = useState<boolean>(false);
	const passwordInputRef = useRef<HTMLInputElement>(null);

	const passwordLogin = async () => {
		const loadingKey = setIsLoginLoading(true);
		const success = await login(username, password);
		if (!success) {
			setShowError(true);
			passwordInputRef.current?.focus();
		}
		setIsLoginLoading(false, loadingKey);
	};

	const updateState = (
		state: "username" | "password",
		event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => {
		setShowError(false);
		(state === "username" ? setUsername : setPassword)(event.target.value);
	};

	const isLoginReady = username && password && !showError;

	if (isAuthorized) return <Navigate to={state?.target ?? "/"} />;

	return (
		<div className="flex min-h-full">
			{/* ── Left panel: ASCII hero ─────────────────────────────────── */}
			<div className="relative hidden lg:flex flex-1 flex-col items-center justify-center overflow-hidden bg-black">
				{/* Scanline overlay */}
				<div
					className="pointer-events-none absolute inset-0 z-10"
					style={{
						background:
							"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)",
					}}
				/>

				{/* Radial vignette */}
				<div
					className="pointer-events-none absolute inset-0 z-10"
					style={{
						background:
							"radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 100%)",
					}}
				/>

				{/* Green ambient glow behind text */}
				<div
					className="pointer-events-none absolute inset-0 z-0"
					style={{
						background:
							"radial-gradient(ellipse 70% 40% at 50% 50%, rgba(92,182,73,0.08) 0%, transparent 70%)",
					}}
				/>

				{/* ASCII art — takes up the full hero area */}
				<div className="relative z-20 w-full px-8" style={{ height: "40vh" }}>
					<SemossAsciiHero />
				</div>

				{/* Tagline */}
				<p
					className="relative z-20 mt-6 font-mono text-sm tracking-[0.35em] uppercase"
					style={{ color: "rgba(92,182,73,0.7)" }}
				>
					AI-Powered Platform
				</p>

				{/* Bottom divider glow */}
				<div
					className="pointer-events-none absolute bottom-0 left-0 right-0 h-px z-20"
					style={{
						background:
							"linear-gradient(to right, transparent, rgba(92,182,73,0.4), transparent)",
					}}
				/>
			</div>

			{/* ── Right panel: login form ────────────────────────────────── */}
			<div className="relative flex flex-1 flex-col items-center justify-center px-4 bg-zinc-950">
				{/* Ambient orbs */}
				<div className="pointer-events-none absolute inset-0 overflow-hidden">
					<div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-gradient-to-br from-slate-500/10 to-sky-400/10 blur-3xl animate-pulse" />
					<div
						className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-gradient-to-tr from-sky-400/10 to-slate-500/10 blur-3xl animate-pulse"
						style={{ animationDelay: "1.25s" }}
					/>
				</div>

				{/* Logo + brand (shown on mobile too since left panel is hidden) */}
				<div className="relative z-10 mb-8 flex flex-col items-center lg:hidden">
					<img src={logoSvg} alt="Agent47" className="h-12 w-12" />
					<span className="mt-2 font-mono text-lg font-bold tracking-widest text-white">
						Agent47
					</span>
				</div>

				{/* Glass card */}
				<div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
					{/* Logo mark on desktop */}
					<div className="mb-8 flex flex-col items-center">
						<img
							src={logoSvg}
							alt="Agent47"
							className="mb-4 h-10 w-10 hidden lg:block"
						/>
						<h1 className="text-2xl font-bold tracking-tight text-white">
							Welcome back
						</h1>
						<p className="mt-1 text-sm text-zinc-400">
							Sign in to your account
						</p>
					</div>

					<div className="flex flex-col space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username" className="text-zinc-300">
								Username
							</Label>
							<Input
								id="username"
								value={username}
								onChange={(event) => updateState("username", event)}
								required
								disabled={isLoginLoading}
								className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-[#5CB649]/60 focus-visible:ring-[#5CB649]/20"
								onKeyDown={(event) => {
									if (event.key === "Enter" && username) {
										passwordInputRef.current?.focus();
									}
								}}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password" className="text-zinc-300">
								Password
							</Label>
							<Input
								id="password"
								value={password}
								onChange={(event) => updateState("password", event)}
								required
								disabled={isLoginLoading}
								type="password"
								className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-[#5CB649]/60 focus-visible:ring-[#5CB649]/20"
								onKeyDown={(event) => {
									if (event.key === "Enter" && isLoginReady) {
										passwordLogin();
									}
								}}
								ref={passwordInputRef}
							/>
							{showError && (
								<p className="text-sm text-red-400">
									Username or password is incorrect.
								</p>
							)}
						</div>
						<Button
							onClick={passwordLogin}
							disabled={!isLoginReady || isLoginLoading}
							className="w-full font-semibold text-white shadow-lg transition-all duration-200"
							style={{
								background: isLoginReady
									? "linear-gradient(135deg, #5CB649 0%, #26890D 100%)"
									: undefined,
							}}
						>
							{isLoginLoading ? "Logging in..." : "Log in"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};
