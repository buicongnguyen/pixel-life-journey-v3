import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createRoom, disposeArt, loadArt, stationArt, type ArtKind } from "./art3d";
import type { Game } from "./engine";

/** Blender artwork is presentation-only: the original simulation owns every action. */
export async function open3D(game: Game, onClose: () => void) {
  const art = await loadArt();
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); }
  catch (error) { art.dispose(); throw error; }
  const panel = document.createElement("section");
  panel.className = "plj-3d";
  panel.setAttribute("aria-label", "Live 3D companion");
  panel.innerHTML = `<header><div><small>PIXEL LIFE JOURNEY</small><b>Life in detail</b></div><nav>
    <button type="button" class="plj-3d-expand" aria-label="Expand 3D view">⛶</button>
    <button type="button" class="plj-3d-close" aria-label="Close 3D view">✕</button></nav></header>
    <div class="plj-3d-scene"></div>
    <div class="plj-3d-caption"><b class="plj-3d-chapter"></b><span class="plj-3d-inspect">Drag to orbit · scroll to inspect the details</span></div>
    <div class="plj-3d-toolbar"><button type="button" class="plj-3d-camera">Follow player</button>
      <button type="button" class="plj-3d-quality">Soft shadows: on</button></div>
    <p class="plj-3d-help">WASD / arrows to move · Space to interact. Green rings: choices · red: hazards. Original touch controls remain available beside this view.</p>
    <details><summary>Use your own Blender avatar</summary>
      <label>Self-contained GLB · up to 10 MB<input type="file" accept=".glb" /></label>
      <p class="plj-3d-status" role="status">Blender-crafted props and materials loaded. Files stay on your device.</p></details>`;
  const viewport = panel.querySelector<HTMLElement>(".plj-3d-scene")!;
  const caption = panel.querySelector<HTMLElement>(".plj-3d-chapter")!;
  const inspect = panel.querySelector<HTMLElement>(".plj-3d-inspect")!;
  const status = panel.querySelector<HTMLElement>(".plj-3d-status")!;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x202b30);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.append(renderer.domElement); document.body.append(panel);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  const environment = pmrem.fromScene(studio, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .35;
  studio.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(38, 1, .05, 80);
  camera.position.set(7.8, 8.5, 11.8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .09;
  controls.maxPolarAngle = Math.PI * .46;
  controls.minDistance = 1.5; controls.maxDistance = 24;
  controls.target.set(0,.25,0); controls.update();
  scene.add(new THREE.HemisphereLight(0xe2efff,0x7a6650,.85));
  const sun = new THREE.DirectionalLight(0xffe1b3,3.2);
  sun.position.set(-3,9,5); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:30});
  sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.radius=3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbed7ff,.8);fill.position.set(6,4,-3);scene.add(fill);
  const avatar = new THREE.Group();scene.add(avatar);
  let defaultAvatar: THREE.Object3D | undefined;
  let avatarKind = "";
  let imported: THREE.Object3D | undefined;
  const gate = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({ color:0x9b8961,metalness:.65,roughness:.27 });
  const gateGlow = new THREE.MeshStandardMaterial({ color:0x667d70,emissive:0x244436,emissiveIntensity:.25 });
  for(const x of [-.27,.27]) {
    const post=new THREE.Mesh(new THREE.BoxGeometry(.075,.92,.09),gateMat);post.position.set(x,.46,0);post.castShadow=true;gate.add(post);
  }
  const lintel=new THREE.Mesh(new THREE.BoxGeometry(.61,.075,.09),gateMat);lintel.position.y=.95;gate.add(lintel);
  const threshold=new THREE.Mesh(new THREE.BoxGeometry(.59,.025,.22),gateGlow);threshold.position.y=.02;gate.add(threshold);
  scene.add(gate);
  type StationView = { root: THREE.Group; marker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; label: string };
  const stations = new Map<string,StationView>();
  let room: ReturnType<typeof createRoom> | undefined;
  let roomKey="";
  let closed=false, generation=0, follow=false;
  let pointer: THREE.Vector2 | undefined;
  const raycaster=new THREE.Raycaster();
  renderer.domElement.addEventListener("pointermove",e=> {
    const rect=renderer.domElement.getBoundingClientRect();
    pointer=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  });
  renderer.domElement.addEventListener("pointerleave",()=>{pointer=undefined;inspect.textContent="Drag to orbit · scroll to inspect the details";});
  const resize=new ResizeObserver(()=> {
    const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  });resize.observe(viewport);
  const removeStation=(view:StationView)=> {
    scene.remove(view.root);view.marker.geometry.dispose();view.marker.material.dispose();
    // Model resources belong to the shared library, not the clone.
  };
  const clock=new THREE.Clock();
  renderer.setAnimationLoop(()=> {
    if(closed||document.hidden)return;
    const t=clock.getElapsedTime();
    const s=game.renderSnapshot();
    const scale=10/Math.max(s.width,s.height);
    const place=(obj:THREE.Object3D,x:number,y:number)=>{obj.position.x=(x-s.width/2)*scale;obj.position.z=(y-s.height/2)*scale;};
    const key=`${s.stage.id}:${s.width}:${s.height}`;
    if(key!==roomKey) {
      if(room){scene.remove(room.root);room.dispose();}
      room=createRoom(s.width*scale,s.height*scale,s.stage.scene,art);scene.add(room.root);roomKey=key;
      caption.textContent=s.stage.name;
    }
    const playerKind:ArtKind=s.player.age<3?"baby":s.player.age<12?"child":s.player.gender==="female"?"woman":"person";
    const playerKey=`${playerKind}:${s.player.age<3?0:s.player.age<12?1:2}`;
    if(avatarKind!==playerKey) {
      if(defaultAvatar)avatar.remove(defaultAvatar);
      defaultAvatar=art.create(playerKind,s.player.age<3?.58:s.player.age<12?.75:1.05);
      defaultAvatar.visible=!imported;avatar.add(defaultAvatar);avatarKind=playerKey;
    }
    place(avatar,s.player.x,s.player.y);
    avatar.position.y=s.player.moving?Math.abs(Math.sin(t*10))*.018:0;
    const rotation:Record<string,number>={front:0,back:Math.PI,left:Math.PI/2,right:-Math.PI/2};
    avatar.rotation.y=rotation[s.player.facing]??0;
    place(gate,s.door.x,s.door.y);gate.rotation.y=Math.PI/2;
    gateGlow.color.set(s.door.open?0x8edfba:0x667d70);gateGlow.emissiveIntensity=s.door.open?.8:.1;
    const active=new Set<string>();
    for(const [index,st] of s.stations.entries()) {
      const modelKind=stationArt(st);const id=`${index}:${st.kind}:${st.id}:${modelKind}`;active.add(id);
      let view=stations.get(id);
      if(!view) {
        const root=new THREE.Group();
        const human=!!st.person;
        // Props retain believable dimensions: flat books/laptops never grow into towers.
        const heights:Partial<Record<ArtKind,number>>={book:.13,laptop:.28,bed:.44,car:.30,money:.17,burger:.28,salad:.16,dumbbell:.20,bottle:.44,teddy:.40};
        const model=art.create(modelKind,human?(modelKind==="baby"?.5:modelKind==="child"?.65:1.02):(heights[modelKind]??.38));
        const marker=new THREE.Mesh(new THREE.RingGeometry(human?.22:.20,human?.25:.23,40),new THREE.MeshBasicMaterial({color:st.harmful?0xdc7463:human?0x94aeca:0x77b598,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
        marker.rotation.x=-Math.PI/2;marker.position.y=.018;
        root.add(model,marker);root.userData.label=st.label;scene.add(root);
        view={root,marker,label:st.label};stations.set(id,view);
      }
      place(view.root,st.x,st.y);
      view.root.scale.setScalar(st.inactive?.85:1);
      view.marker.material.opacity=st.inactive?.15:.65;
    }
    for(const [id,view]of stations)if(!active.has(id)){removeStation(view);stations.delete(id);}
    if(follow) {
      const delta=avatar.position.clone().sub(controls.target);delta.y=0;
      controls.target.addScaledVector(delta,.06);camera.position.addScaledVector(delta,.06);
    }
    controls.update();
    if(pointer) {
      raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObjects([...stations.values()].map(v=>v.root),true);
      let object:THREE.Object3D|undefined=hits[0]?.object;
      while(object&&!object.userData.label)object=object.parent??undefined;
      inspect.textContent=object?.userData.label??"Drag to orbit · scroll to inspect the details";
    }
    renderer.render(scene,camera);
  });
  panel.querySelector<HTMLButtonElement>(".plj-3d-camera")!.onclick=e=> {
    follow=!follow;(e.currentTarget as HTMLButtonElement).textContent=follow?"Show whole room":"Follow player";
    if(!follow){controls.target.set(0,.25,0);camera.position.set(7.8,8.5,11.8);}
    else {const direction=new THREE.Vector3(2.4,2.7,3.8);controls.target.copy(avatar.position);camera.position.copy(avatar.position).add(direction);}
    (e.currentTarget as HTMLButtonElement).blur();
  };
  panel.querySelector<HTMLButtonElement>(".plj-3d-quality")!.onclick=e=>{
    renderer.shadowMap.enabled=!renderer.shadowMap.enabled;
    (e.currentTarget as HTMLButtonElement).textContent=`Soft shadows: ${renderer.shadowMap.enabled?"on":"off"}`;
  };
  panel.querySelector<HTMLButtonElement>(".plj-3d-expand")!.onclick=e=>{
    const expanded=panel.classList.toggle("is-expanded");
    (e.currentTarget as HTMLButtonElement).setAttribute("aria-label",expanded?"Shrink 3D view":"Expand 3D view");
  };
  panel.querySelector<HTMLInputElement>("input")!.onchange=async e=>{
    const file=(e.currentTarget as HTMLInputElement).files?.[0];const token=++generation;if(!file)return;
    if(!file.name.toLowerCase().endsWith(".glb")||file.size>10*1024*1024){status.textContent="Choose a self-contained .glb under 10 MB.";return;}
    status.textContent="Loading avatar…";let model:THREE.Object3D|undefined;
    try {
      const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^(blob:|data:)/.test(url))return url;throw new Error("Embed all textures in your GLB.");});
      const gltf=await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(),"");model=gltf.scene;
      if(closed||token!==generation){disposeArt(model);return;}
      const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());const longest=Math.max(size.x,size.y,size.z);
      if(!Number.isFinite(longest)||longest<=0)throw new Error("Model has no visible geometry.");
      const center=box.getCenter(new THREE.Vector3());const factor=1.05/longest;
      model.scale.multiplyScalar(factor);model.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);
      model.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
      if(imported){avatar.remove(imported);disposeArt(imported);}imported=model;avatar.add(model);
      if(defaultAvatar)defaultAvatar.visible=false;status.textContent=`${file.name} loaded.`;
    }catch(error){if(model)disposeArt(model);if(!closed&&token===generation)status.textContent=error instanceof Error?error.message:"Unable to load GLB.";}
  };
  const close=()=>{
    if(closed)return;closed=true;generation++;renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();
    for(const view of stations.values())removeStation(view);
    room?.dispose();if(imported)disposeArt(imported);disposeArt(gate);art.dispose();environment.dispose();
    renderer.dispose();renderer.forceContextLoss();panel.remove();onClose();
  };
  panel.querySelector<HTMLButtonElement>(".plj-3d-close")!.onclick=close;
  renderer.domElement.addEventListener("webglcontextlost",e=>{e.preventDefault();close();});
  return close;
}
