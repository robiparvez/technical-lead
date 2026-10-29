import { getSearchIndex } from '@/data';

export async function GET() {
    return Response.json(await getSearchIndex());
}
