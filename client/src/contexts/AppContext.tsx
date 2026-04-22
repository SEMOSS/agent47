import {
	getSystemConfig,
	runPixel as runPixelSemossSdk,
	runPixelAsync as runPixelAsyncSemossSdk,
	getPixelAsyncResult as getPixelAsyncResultSemossSdk,
	Env,
	post as sdkPost,
} from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { toast } from "sonner";
import { useLoadingState } from "@/hooks";

/**
 * Response shape from the pixelJobStreaming endpoint.
 * Each message has a stream_type ("content", "thinking", or "tool")
 * and a data payload.
 */
export interface StreamingMessage {
	stream_type: "content" | "thinking" | "tool";
	data: Record<string, unknown> & {
		content?: string;
		thinking?: string;
		finish_reason?: string;
		event?: string;
		uuid?: string;
		sessionId?: string;
		data?: Record<string, unknown>;
	};
}

export interface StreamingResponse {
	message: StreamingMessage[];
	status:
		| "Created"
		| "Submitted"
		| "InProgress"
		| "Streaming"
		| "ProgressComplete"
		| "Complete"
		| "Error"
		| "Paused";
}

export interface AppContextType {
	runPixel: (<T = unknown>(
		pixelString: string,
		successMessage?: string,
	) => Promise<T>) &
		(<T extends unknown[] = unknown[]>(
			pixelString: string[],
			successMessage?: string,
		) => Promise<T>);
	runPixelAsync: (pixelString: string) => Promise<{ jobId: string }>;
	getPixelAsyncResult: <O extends unknown[] | []>(
		jobId: string,
	) => Promise<{
		errors: string[];
		insightId: string;
		results: {
			isMeta: boolean;
			operationType: string[];
			output: O[number];
			pixelExpression: string;
			pixelId: string;
			additionalOutput?: unknown;
			timeToRun: number;
		}[];
	}>;
	getPixelJobStreaming: (jobId: string) => Promise<StreamingResponse>;
	sendMCPResponseToPlayground: (
		toolName: string,
		toolResponse: string,
	) => void;
	login: (username: string, password: string) => Promise<boolean>;
	logout: () => Promise<boolean>;
	userLoginName: string;
	isAppDataLoading: boolean;
	isUserLoginLoading: boolean;
	exampleStateData?: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * Custom hook to get the stored app data and runPixel.
 *
 * @returns {AppContextType} - The data
 */
export const useAppContext = (): AppContextType => {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error(
			"useAppContext must be used within an AppContextProvider",
		);
	}

	return context;
};

/**
 * Stores data accessible to the entire app. Must be used within an InsightProvider.
 *
 * @param {ReactNode} props.children The children who will have access to the app data.
 * @component
 */
export const AppContextProvider = ({ children }: PropsWithChildren) => {
	// Get the current state of the current insight
	const { actions, isReady, system, insightId, tool } = useInsight();

	/**
	 * State
	 */
	const [isUserLoginLoading, setIsUserLoginLoading] = useLoadingState(false);
	const [isAppDataLoading, setIsAppDataLoading] = useLoadingState(true);
	const [userLoginName, setUserLoginName] = useState<string | null>(null);
	// Example state variable to store the result of a pixel operation
	const [exampleStateData, setExampleStateData] = useState<number>();

	/**
	 * Functions
	 */

	/**
	 * Run pixel code
	 * @param pixelString - the pixel string to run
	 * @param successMessage - optional parameter to show a success message
	 */
	const runPixel = useCallback(
		async <T = unknown>(
			pixelString: string | string[],
			successMessage?: string,
		) => {
			const multiple = Array.isArray(pixelString);
			try {
				const response = await runPixelSemossSdk<
					T extends unknown[] ? T : T[]
				>(multiple ? pixelString.join("; ") : pixelString, insightId);
				if (response.errors.length > 0)
					throw new Error(
						response.errors
							.map(
								(
									error:
										| string
										| {
												message: string;
										  }
										| undefined,
								) =>
									(typeof error === "string"
										? error
										: error?.message) ??
									"Error during operation",
							)
							.join(", "),
					);
				if (successMessage) {
					toast.success(successMessage);
				}
				return (
					multiple
						? response.pixelReturn.map((item) => item.output)
						: response.pixelReturn[0].output
				) as T;
			} catch (error) {
				toast.error(`${error.message ?? "Error during operation"}`);
				throw error;
			}
		},
		[insightId],
	);

	/**
	 * Run a pixel asynchronously and get a jobId for polling
	 * @param pixelString - the pixel string to run
	 */
	const runPixelAsyncFn = useCallback(
		async (pixelString: string) => {
			try {
				const response = await runPixelAsyncSemossSdk(
					pixelString,
					insightId,
				);
				return response;
			} catch (error) {
				toast.error(`${error.message ?? "Error starting async pixel"}`);
				throw error;
			}
		},
		[insightId],
	);

	/**
	 * Get the final result of an async pixel job
	 * @param jobId - the job id to get results for
	 */
	const getPixelAsyncResultFn = useCallback(
		async <O extends unknown[] | []>(jobId: string) => {
			try {
				const response = await getPixelAsyncResultSemossSdk<O>(jobId);
				return response;
			} catch (error) {
				toast.error(
					`${error.message ?? "Error getting async pixel result"}`,
				);
				throw error;
			}
		},
		[],
	);

	/**
	 * Poll for streaming chunks from an async pixel job.
	 * Hits the /api/engine/pixelJobStreaming endpoint with the jobId.
	 * @param jobId - the job id to poll streaming content for
	 */
	const getPixelJobStreaming = useCallback(
		async (jobId: string): Promise<StreamingResponse> => {
			const response = await sdkPost(
				`${Env.MODULE}/api/engine/pixelJobStreaming`,
				{ jobId },
				{},
			);
			return response.data as StreamingResponse;
		},
		[],
	);

	/**
	 * If running in MCP mode, send the response to Playground
	 * @param name - name of the tool
	 * @param response - response from the tool to send to Playground
	 */
	const sendMCPResponseToPlayground = useCallback(
		(toolName: string, toolResponse: string) => {
			try {
				if (tool && tool.name === toolName) {
					actions.sendMCPResponseToPlayground(toolResponse);
				}
			} catch (error) {
				toast.error(
					`${error.message ?? "Error sending response to Playground"}`,
				);
				throw error;
			}
		},
		[actions, tool],
	);

	// Allow users to log in, and grab their name when they do
	const login = useCallback(
		async (username: string, password: string) => {
			const loadingKey = setIsUserLoginLoading(true);
			try {
				await actions.login({
					type: "native",
					username,
					password,
				});
				// Run a new config call, to get the name of the user
				const response = await getSystemConfig();
				setUserLoginName(
					Object.values(response?.logins ?? {})?.[0]?.toString() ||
						null,
				);
				return true;
			} catch {
				return false;
			} finally {
				setIsUserLoginLoading(false, loadingKey);
			}
		},
		[actions, setIsUserLoginLoading],
	);

	// Allow users to log out, and clear their name when they do
	const logout = useCallback(async () => {
		const loadingKey = setIsUserLoginLoading(true);
		try {
			await actions.logout();
			setUserLoginName(null);
			return true;
		} catch {
			return false;
		} finally {
			setIsUserLoginLoading(false, loadingKey);
		}
	}, [actions, setIsUserLoginLoading]);

	/**
	 * Effects
	 */
	useEffect(() => {
		// Function to load app data
		const loadAppData = async () => {
			const loadingKey = setIsAppDataLoading(true);

			try {
				// Define a type for the loader and setter pairs
				// This allows us to load multiple pieces of data simultaneously and set them in state after everything has loaded successfully
				interface LoadSetPair<T> {
					loader: () => Promise<T>;
					value?: T;
					setter?: (value: T) => void;
				}

				// Create an array of loadSetPairs, each containing a loader function and a setter function
				const loadSetPairs: LoadSetPair<unknown>[] = [
					// Example pixel to load some data
					{
						loader: async () => {
							return await runPixel<number>(`1 + 2`);
						},
						setter: (response) => setExampleStateData(response),
					} satisfies LoadSetPair<number>,
				];

				// Execute all loaders in parallel and wait for them all to complete
				await Promise.all(
					loadSetPairs.map(async (loadSetPair) => {
						loadSetPair.value = await loadSetPair.loader();
						return;
					}),
				);

				// Once all loaders have completed, set the loading state to false
				// and call each setter with the loaded value
				setIsAppDataLoading(false, loadingKey, () =>
					loadSetPairs.forEach((loadSetPair) => {
						loadSetPair.setter?.(loadSetPair.value);
					}),
				);
			} catch (e) {
				// If any loader fails, display an error message
				toast.error(
					`Error initializing app data${e.message ? `: ${e.message}` : ""}`,
				);
			}
		};

		if (isReady) {
			// If the insight is ready, then load the app data
			loadAppData();
		}
	}, [isReady, runPixel, setIsAppDataLoading]);

	// On start up, grab the name of the user from the config call if they are already logged in
	useEffect(() => {
		setUserLoginName(
			Object.values(system?.config?.logins ?? {})?.[0]?.toString() ||
				null,
		);
	}, [system]);

	return (
		<AppContext.Provider
			value={{
				runPixel,
				runPixelAsync: runPixelAsyncFn,
				getPixelAsyncResult: getPixelAsyncResultFn,
				getPixelJobStreaming,
				sendMCPResponseToPlayground,
				exampleStateData,
				isAppDataLoading,
				login,
				logout,
				userLoginName,
				isUserLoginLoading,
			}}
		>
			{children}
		</AppContext.Provider>
	);
};
