import icons from '../../branding/tool-icons.json';

export default function ToolIcon(props) {
  const icon = icons[props.id];
  return <svg class="tool-icon" width="36" height="36" viewBox="0 0 32 34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d={icon.tone} fill="currentColor" fill-opacity=".12" stroke="none"/>
    <path d={icon.lines}/>
    {icon.dots?.map(([x,y])=><circle cx={x} cy={y} r="1.5" fill="currentColor" stroke-width=".6"/>)}
  </svg>;
}
