import { useEffect, useRef, useState } from "react";
import { useSound } from "@/context/SoundContext";

export function useInactivityNudge(canAct: boolean, decision: string) {
   const { play } = useSound();
   const sound = useRef(play);
   sound.current = play;
   const [shaking, setShaking] = useState(false);
   const [activity, setActivity] = useState(0);
   useEffect(() => {
      if (!canAct) return;
      let end: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
         sound.current("notification");
         setShaking(true);
         end = setTimeout(() => setShaking(false), 2000);
      }, 15000);
      return () => {
         clearTimeout(timer);
         clearTimeout(end);
         setShaking(false);
      };
   }, [canAct, decision, activity]);
   return { shaking, reset: () => setActivity(value => value + 1) };
}
