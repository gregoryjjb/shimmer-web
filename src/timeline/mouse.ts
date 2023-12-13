export const leftButtonHeld = (event: MouseEvent) => {
  return (event.buttons & 1) === 1;
};

export const middleButtonHeld = (event: MouseEvent) => {
  return ((event.buttons >> 2) & 1) === 1;
};
