import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardSm } from './card-sm';

describe('CardSm', () => {
  let component: CardSm;
  let fixture: ComponentFixture<CardSm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardSm],
    }).compileComponents();

    fixture = TestBed.createComponent(CardSm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
