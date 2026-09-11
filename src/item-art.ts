/** Blender-rendered sprites load on demand; Canvas play never imports Three.js. */
const ICON_ART: Record<string,string> = {
  "🍼":"bottle", "📚":"book", "📖":"book", "📗":"book", "📓":"book",
  "🍎":"apple", "🥗":"salad", "🍔":"burger",
  "🏋️":"dumbbell", "💪":"dumbbell", "😴":"bed", "🛌":"bed",
  "💻":"laptop", "🖥️":"laptop", "🎮":"laptop", "📺":"laptop", "📱":"laptop",
  "🧸":"teddy", "💰":"money", "💵":"money", "📈":"money",
  "🌱":"plant", "🪴":"plant", "🚗":"car", "🏎️":"car",
};
const cache=new Map<string,HTMLImageElement>();
export function itemArtwork(icon:string):HTMLImageElement|undefined {
  const key=ICON_ART[icon];if(!key)return;
  let image=cache.get(key);
  if(!image){image=new Image();image.decoding="async";image.src=`${import.meta.env.BASE_URL}art-icons/${key}.png`;cache.set(key,image);}
  return image.complete&&image.naturalWidth>0?image:undefined;
}
