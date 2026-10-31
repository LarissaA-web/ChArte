import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PinCardModal } from './pin-card-modal';

describe('PinCardModal', () => {
  let component: PinCardModal;
  let fixture: ComponentFixture<PinCardModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PinCardModal],
    }).compileComponents();

    fixture = TestBed.createComponent(PinCardModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
