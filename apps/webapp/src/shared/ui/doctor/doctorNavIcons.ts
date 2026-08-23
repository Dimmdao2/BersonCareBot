import type { ElementType } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  FolderOpen,
  GraduationCap,
  HouseHeart,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  Plug,
  ScrollText,
  Server,
  Settings,
  Shield,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';

/** Единственный набор иконок основной навигации врача: sidebar, sheet и bottom-nav. */
export function getDoctorMenuIcon(id: string): ElementType | null {
  switch (id) {
    case 'today':
      return LayoutDashboard;
    case 'tasks':
      return ListTodo;
    case 'patient-home':
      return HouseHeart;
    case 'patients':
    case 'clients':
      return Users;
    case 'schedule':
    case 'admin-booking':
      return Calendar;
    case 'communications':
      return MessageCircle;
    case 'library':
      return BookOpen;
    case 'content':
      return FileText;
    case 'files-and-media':
      return FolderOpen;
    case 'courses':
      return GraduationCap;
    case 'analytics':
      return BarChart3;
    case 'management':
      return BriefcaseBusiness;
    case 'account':
      return UserRound;
    case 'settings':
    case 'admin-app-settings':
      return Settings;
    case 'system':
      return Server;
    case 'account-security':
      return Shield;
    case 'clinics':
      return Building2;
    case 'commercial':
      return CreditCard;
    case 'payments':
      return Wallet;
    case 'admin-auth':
      return KeyRound;
    case 'admin-integrations':
      return Plug;
    case 'admin-notifications':
      return Bell;
    case 'admin-technical':
      return Wrench;
    case 'system-health':
      return Activity;
    case 'health-archive':
      return Archive;
    case 'audit-log':
      return ScrollText;
    default:
      return null;
  }
}
