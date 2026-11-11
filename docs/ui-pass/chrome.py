import sys,runpy,os
# Only diagnostic filenames need an absolute fallback across Windows drives.
old_relpath = os.path.relpath
def evidence_relpath(path, start=None):
 try:
  return old_relpath(path, start)
 except ValueError:
  if os.path.splitdrive(os.path.abspath(path))[0].lower() != os.path.splitdrive(os.path.abspath(start or os.curdir))[0].lower():
   return os.path.abspath(path)
  raise
os.path.relpath = evidence_relpath
from playwright.async_api import BrowserType as AsyncType
from playwright.sync_api import BrowserType as SyncType
old_async=AsyncType.launch
old_sync=SyncType.launch
async def launch_async(self,*args,**kwargs):
 kwargs["channel"] = kwargs.get("channel") or "chrome"
 return await old_async(self,*args,**kwargs)
def launch_sync(self,*args,**kwargs):
 kwargs["channel"] = kwargs.get("channel") or "chrome"
 return old_sync(self,*args,**kwargs)
AsyncType.launch=launch_async
SyncType.launch=launch_sync
# Adapter stub for the inherited missing browser favicon. No game URL is intercepted.
from playwright.async_api import Browser as AsyncBrowser
from playwright.sync_api import Browser as SyncBrowser
old_async_context=AsyncBrowser.new_context
old_sync_context=SyncBrowser.new_context
async def new_async_context(self,*args,**kwargs):
 ctx=await old_async_context(self,*args,**kwargs)
 await ctx.route("http://localhost:*/favicon.ico",lambda route:route.fulfill(status=204,body=""))
 return ctx
def new_sync_context(self,*args,**kwargs):
 ctx=old_sync_context(self,*args,**kwargs)
 ctx.route("http://localhost:*/favicon.ico",lambda route:route.fulfill(status=204,body=""))
 return ctx
AsyncBrowser.new_context=new_async_context
SyncBrowser.new_context=new_sync_context
# Browser.new_page creates its context internally and bypasses new_context.
old_async_page=AsyncBrowser.new_page
old_sync_page=SyncBrowser.new_page
async def new_async_page(self,*args,**kwargs):
 page=await old_async_page(self,*args,**kwargs)
 await page.route("http://localhost:*/favicon.ico",lambda route:route.fulfill(status=204,body=""))
 return page
def new_sync_page(self,*args,**kwargs):
 page=old_sync_page(self,*args,**kwargs)
 page.route("http://localhost:*/favicon.ico",lambda route:route.fulfill(status=204,body=""))
 return page
AsyncBrowser.new_page=new_async_page
SyncBrowser.new_page=new_sync_page
# Still captures opt in; functional tests and animation-strip timing stay unchanged.
if os.environ.get("MM_CAPTURE_READY") == "1":
 from playwright.async_api import Page as AsyncPage
 still_screenshot=AsyncPage.screenshot
 async def ready_still(self,*args,**kwargs):
  await self.wait_for_load_state("networkidle",timeout=90000)
  await self.evaluate("async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}")
  print("[still-ready] networkidle, fonts, image decode, two paint frames",flush=True)
  return await still_screenshot(self,*args,**kwargs)
 AsyncPage.screenshot=ready_still

path=os.path.abspath(sys.argv[1]);sys.argv=sys.argv[1:];sys.path.insert(0,os.path.dirname(path))
runpy.run_path(path,run_name="__main__")
