import { Link, useRouterState } from "@tanstack/react-router";
import { Archive, LayoutDashboard, FileCheck, FilePlus2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/logo.png";
import { BUSINESS } from "@/lib/business";

const items = [
  { title: "Menú principal", url: "/", icon: LayoutDashboard },
  { title: "Nuevo remito", url: "/nueva", icon: FilePlus2 },
  { title: "Remitos borradores", url: "/borradores", icon: Archive },
  { title: "Remitos emitidos", url: "/historial", icon: FileCheck },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const closeSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-3 group-data-[collapsible=icon]:-mx-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          <img
            src={logo}
            alt="Manda Remito"
            className="h-10 w-10 shrink-0 rounded-full glow-cyan transition-[width,height] duration-200 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-wide text-gradient">
              MANDA REMITO
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              LRG Web Design
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Panel Administrativo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.url} className="flex items-center gap-3" onClick={closeSidebar}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-3 text-xs group-data-[collapsible=icon]:hidden">
          <p className="font-medium text-foreground">{BUSINESS.name}</p>
          <p className="text-muted-foreground">{BUSINESS.role}</p>
          <p className="text-muted-foreground">{BUSINESS.location}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}