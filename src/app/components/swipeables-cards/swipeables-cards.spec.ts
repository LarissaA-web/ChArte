import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SwipeablesCards } from './swipeables-cards';

describe('SwipeablesCards', () => {
  let component: SwipeablesCards;
  let fixture: ComponentFixture<SwipeablesCards>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SwipeablesCards],
    }).compileComponents();

    fixture = TestBed.createComponent(SwipeablesCards);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
