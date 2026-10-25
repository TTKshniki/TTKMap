import React from 'react';
import { Icon } from '../shared/Icon';

type IconProps = { className?: string };

function glyph(name: string): React.FC<IconProps> {
  return function Glyph({ className }) {
    return <Icon name={name} className={className} />;
  };
}

export const Activity = glyph('activity');
export const ArrowLeft = glyph('arrow-left');
export const ArrowRight = glyph('arrow-right');
export const Bell = glyph('bell');
export const Bookmark = glyph('bookmark');
export const ChevronDown = glyph('chevron-down');
export const ChevronLeft = glyph('chevron-left');
export const ChevronRight = glyph('chevron-right');
export const Clock = glyph('clock');
export const Eye = glyph('eye');
export const Heart = glyph('heart');
export const LogIn = glyph('log-in');
export const Map = glyph('map');
export const MapPin = glyph('map-pin');
export const Maximize2 = glyph('maximize-2');
export const Menu = glyph('menu');
export const Monitor = glyph('monitor');
export const Moon = glyph('moon');
export const Navigation = glyph('navigation');
export const Navigation2 = glyph('navigation-2');
export const QrCode = glyph('qr-code');
export const Rotate3d = glyph('rotate-3d');
export const Route = glyph('route');
export const Search = glyph('search');
export const ShieldCheck = glyph('shield-check');
export const Sparkles = glyph('sparkles');
export const Sun = glyph('sun');
export const Trash2 = glyph('trash-2');
export const User = glyph('user');
export const Users = glyph('users');
export const Wifi = glyph('wifi');
export const X = glyph('x');
export const ZoomIn = glyph('zoom-in');
export const ZoomOut = glyph('zoom-out');
