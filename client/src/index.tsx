import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { App } from "./App";
import { store } from "./store";
import "./index.css";

// This is the root file of the React app. The code below renders <App /> inside of the <div id="root" />
createRoot(document.getElementById("root")).render(
	<StrictMode>
		<Provider store={store}>
			<App />
		</Provider>
	</StrictMode>,
);
