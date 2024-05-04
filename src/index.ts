import { httpServer } from './protocol/httpServerApi';
import { simpleProtServer } from './protocol/simple_prot';


// simpleProtServer(8080, "127.0.0.1");
httpServer(8080, "127.0.0.1");