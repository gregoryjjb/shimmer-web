import {
  createSignal,
  createContext,
  useContext,
  Component,
  ParentComponent,
  onCleanup,
  createMemo,
  Accessor,
} from 'solid-js';

export default function clickOutside(
  el: Element,
  accessor: Accessor<() => void>
) {
  const onClick = (e: MouseEvent) =>
    !el.contains(e.target as Node) && accessor()?.();
  document.body.addEventListener('click', onClick);

  onCleanup(() => document.body.removeEventListener('click', onClick));
}

const makeContext = () => {
  const [open, setOpen] = createSignal<string | null>(null);
  return { open, setOpen } as const;
};

const MenuContext = createContext<ReturnType<typeof makeContext>>();

const MenuProvider: ParentComponent = (props) => {
  // const [open, setOpen] = createSignal<string | null>(null);
  // const opener = [
  //   open,
  //   {
  //     setOpen(key: string) {
  //       setOpen(key);
  //     },
  //   },
  // ];

  const value = makeContext();

  return (
    <MenuContext.Provider value={value}>{props.children}</MenuContext.Provider>
  );
};

const useMenu = () => {
  return useContext(MenuContext);
};

export const MenuBar: ParentComponent = (props) => {
  const ctx = makeContext();

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key.toLocaleLowerCase() === 'escape') {
      ctx.setOpen(null);
    }
  };

  window.addEventListener('keydown', handleKeydown);
  onCleanup(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  return (
    <MenuContext.Provider value={ctx}>
      <div class="flex items-start bg-zinc-800">
        <div use:clickOutside={() => ctx.setOpen(null)} class="flex  p-1">
          {props.children}
        </div>
      </div>
    </MenuContext.Provider>
  );
};

export const Menu: ParentComponent<{
  name: string;
}> = (props) => {
  const ctx = useMenu();

  const isOpen = createMemo(() => ctx?.open() === props.name);

  return (
    <div class="relative">
      <button
        class="text-white hover:bg-zinc-600 text-sm px-2 py-0.5 rounded"
        classList={{
          'bg-zinc-600': isOpen(),
        }}
        onClick={() =>
          ctx?.setOpen((v) => (v === props.name ? null : props.name))
        }
        onMouseOver={() => {
          ctx?.setOpen((v) => (v && props.name) || null);
        }}
      >
        {props.name}
      </button>
      {isOpen() && (
        <div class="absolute z-10 bg-zinc-800 py-2 px-1 rounded flex flex-col min-w-[300px] shadow-md">
          {props.children}
        </div>
      )}
    </div>
  );
};

interface MenuItemProps {
  name: string;
  disabled?: boolean;
  onClick?: () => void;
}

export const MenuItem: Component<MenuItemProps> = (props) => {
  const ctx = useMenu();

  return (
    <button
      class="text-white text-sm hover:bg-zinc-600 focus:bg-zinc-600 text-left px-2 py-1 rounded"
      onClick={() => {
        ctx?.setOpen(null);
        props.onClick && props.onClick();
      }}
      disabled={props.disabled}
    >
      {props.name}
    </button>
  );
};

export const MenuItemSpacer: Component = () => {
  return <hr class="border-zinc-500 my-1 mx-2" />;
};
