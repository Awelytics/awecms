import { z } from "zod";
import { EditComponent } from "./edit-component";

const schema = () => z.any().optional();

export { EditComponent, schema };