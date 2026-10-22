export async function register(){
  // Only the production start launcher opts in. Build/dev/Windows validation cannot run jobs.
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.DMP_KIDS_SCHEDULER==='1'&&process.env.NODE_ENV==='production'){
    const {startAutomaticAttendanceWorker}=await import('./lib/kids/automatic-attendance-worker');
    startAutomaticAttendanceWorker();
  }
}
