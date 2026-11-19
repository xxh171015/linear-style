import path from "node:path";
import { createReplicaServer } from "./app";
const port=Number(process.env.REPLICA_PORT??4175),host=process.env.REPLICA_HOST??"127.0.0.1";
if(!Number.isInteger(port)||port<1||port>65535)throw Error("Choose a port between 1 and 65535.");
const server=createReplicaServer({databasePath:process.env.REPLICA_DATABASE??path.resolve(".replica-server/workspaces.sqlite"),staticRoot:path.resolve("dist"),publicOrigin:process.env.REPLICA_PUBLIC_ORIGIN});
server.listen(port,host,()=>console.log(`Linear Replica server: http://${host}:${port}`));
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{server.close();server.closeAllConnections();});
