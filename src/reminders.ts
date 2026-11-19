import type { Cycle } from "./types";

export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function reminderPresets(now: Date, cycles: Cycle[]) {
  const at = (days:number,hour=9) => {const d=new Date(now);d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d;};
  const month = at(0); const targetMonth=month.getMonth()+1;
  month.setDate(1);month.setMonth(targetMonth);
  const lastDay=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();month.setDate(Math.min(now.getDate(),lastDay));
  const nextCycle = cycles.filter(c=>c.startDate>localDay(now)).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0];
  return [
    {label:"An hour from now",date:new Date(now.getTime()+3600000)},
    {label:"In 3 hours",date:new Date(now.getTime()+10800000)},
    {label:"This evening",date:at(0,18)},
    {label:"Tomorrow",date:at(1)},
    {label:"Next week",date:at(((8-now.getDay())%7)||7)},
    {label:"A month from now",date:month},
    {label:"Next cycle",date:nextCycle?new Date(`${nextCycle.startDate}T09:00:00`):null},
  ];
}

/** Deliberately bounded input grammar; no unrestricted Date.parse of natural-language text. */
export function parseReminderInput(input:string,now:Date):Date|null {
  const text=input.trim().toLowerCase();
  const relative=/^(?:in\s+)?(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)$/.exec(text);
  let result:Date|null=null;
  if(relative) {
    const amount=Number(relative[1]); if(!Number.isSafeInteger(amount)||amount<1||amount>10000)return null;
    const unit=relative[2];result=new Date(now);
    if(unit.startsWith("day")||unit.startsWith("week"))result.setDate(result.getDate()+amount*(unit.startsWith("week")?7:1));
    else result=new Date(now.getTime()+amount*(unit.startsWith("h")?3600000:60000));
  } else {
    const clock=/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
    const iso=/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{2}):(\d{2}))?$/.exec(text);
    if(clock) {
      let hour=Number(clock[1]);const minute=Number(clock[2]??0);
      if(minute>59||hour>(clock[3]?12:23)||(clock[3]&&hour<1))return null;
      if(clock[3])hour=hour%12+(clock[3]==="pm"?12:0);
      result=new Date(now);result.setHours(hour,minute,0,0);
      if(result<=now)result.setDate(result.getDate()+1);
    } else if(iso) {
      const [year,month,day,hour,minute]=[Number(iso[1]),Number(iso[2]),Number(iso[3]),Number(iso[4]??9),Number(iso[5]??0)];
      result=new Date(year,month-1,day,hour,minute);
      if(result.getFullYear()!==year||result.getMonth()!==month-1||result.getDate()!==day||hour>23||minute>59)return null;
    }
  }
  return result && Number.isFinite(result.getTime()) && result>now?result:null;
}
