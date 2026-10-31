import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PinCard } from './pin-card';

describe('PinCard', () => {
  let component: PinCard;
  let fixture: ComponentFixture<PinCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PinCard],
    }).compileComponents();

    fixture = TestBed.createComponent(PinCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
