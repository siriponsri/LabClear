"""Optional single-instance Render entry point: API plus durable LINE worker."""
import asyncio,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1]/'.env')
import uvicorn
async def main():
    server=uvicorn.Server(uvicorn.Config('main:app',host='0.0.0.0',port=int(os.getenv('PORT','8000')),log_level='warning'))
    tasks=[]
    if os.getenv('BUSINESS_WORKER_ENABLED')=='true':
        from services.business_worker import main as worker
        tasks.append(asyncio.create_task(worker()))
    try:await server.serve()
    finally:
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
if __name__=='__main__':asyncio.run(main())
