# Agent47

## Local Installation

1. Create a new project in your local instance of SEMOSS called Agent47.
2. Find the assets directory of the project you created. (ex. `/Users/rweiler/Documents/SEMOSS/workspace/Semoss/project/Agent47__00bfb9ab-31ff-46e0-b945-2a72e40c93d4/app_root/version/assets`)
3. Remove the existing files and directories in the assets directory.
4. Git clone the Agent47 repository into the assets directory. (ex. `git clone git@github.com:SEMOSS/agent47.git`)
5. In the client directory of the cloned repository, run `pnpm install` to install the dependencies.
6. Open the Docker Desktop application.
7. Run the following command in the terminal to pull the node builder server image. (`docker pull ghcr.io/kunal0137/smss-node-builder:latest`)
8. After the image is pulled, run the following command to start the node builder server. (`docker run -p 3000:3000 ghcr.io/kunal0137/smss-node-builder:latest`)
9. In the client directory of the cloned repository, run `pnpm run dev` to start the development server.
10. Open your web browser and navigate to `http://localhost:5173` to access the Agent47 application.